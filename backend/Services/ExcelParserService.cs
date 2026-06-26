using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Text.RegularExpressions;
using ExcelDataReader;
using EduGuard.Models;

namespace EduGuard.Services
{
    public class ParsedStudentRow
    {
        public string RollNo { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string PhoneNo { get; set; } = string.Empty;
        public double? Attendance { get; set; }
        public string Behavior { get; set; } = string.Empty;
        public List<string> Contribution { get; set; } = new();
        public List<SubjectMarks> Marks { get; set; } = new();
    }

    public class ExcelParserService
    {
        public ExcelParserService()
        {
            // Register encoding provider required for ExcelDataReader
            System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        }

        public List<ParsedStudentRow> ParseRoster(Stream fileStream)
        {
            var parsedRows = new List<ParsedStudentRow>();

            using (var reader = ExcelReaderFactory.CreateReader(fileStream))
            {
                var result = reader.AsDataSet(new ExcelDataSetConfiguration
                {
                    ConfigureDataTable = (_) => new ExcelDataTableConfiguration
                    {
                        UseHeaderRow = true
                    }
                });

                if (result.Tables.Count == 0) return parsedRows;

                var table = result.Tables[0];
                var columns = table.Columns;

                // Map header index by lowercase names
                var headerMap = new Dictionary<string, int>();
                for (int i = 0; i < columns.Count; i++)
                {
                    var colName = columns[i].ColumnName?.Trim().ToLower().Replace(" ", "").Replace("_", "").Replace("-", "") ?? "";
                    if (!headerMap.ContainsKey(colName))
                    {
                        headerMap[colName] = i;
                    }
                }

                foreach (DataRow row in table.Rows)
                {
                    var rollNo = GetRowStringValue(row, headerMap, new[] { "rollno", "roll", "studentroll", "id" });
                    var name = GetRowStringValue(row, headerMap, new[] { "name", "studentname", "fullname" });

                    if (string.IsNullOrEmpty(rollNo) || string.IsNullOrEmpty(name))
                    {
                        continue; // Roll number and name are required
                    }

                    var email = GetRowStringValue(row, headerMap, new[] { "email", "emailaddress" });
                    var phoneNo = GetRowStringValue(row, headerMap, new[] { "phoneno", "phone", "mobile", "contact", "contactno" });
                    var attendanceVal = GetRowDoubleValue(row, headerMap, new[] { "attendance", "attendancepercentage", "att" });
                    var behavior = GetRowStringValue(row, headerMap, new[] { "behavior", "conduct" });
                    var contributionStr = GetRowStringValue(row, headerMap, new[] { "contribution", "contributions", "extra", "cocurricular" });
                    var contributions = new List<string>();
                    if (!string.IsNullOrEmpty(contributionStr))
                    {
                        foreach (var c in contributionStr.Split(','))
                        {
                            var trimmed = c.Trim();
                            if (!string.IsNullOrEmpty(trimmed)) contributions.Add(trimmed);
                        }
                    }

                    var studentRow = new ParsedStudentRow
                    {
                        RollNo = rollNo,
                        Name = name,
                        Email = email,
                        PhoneNo = phoneNo,
                        Attendance = attendanceVal,
                        Behavior = behavior,
                        Contribution = contributions
                    };

                    // Parse subject marks from dynamic columns
                    var subjectsMap = new Dictionary<string, SubjectMarks>(StringComparer.OrdinalIgnoreCase);

                    for (int c = 0; c < columns.Count; c++)
                    {
                        var columnName = columns[c].ColumnName ?? "";
                        // Matches Pattern: Subject_Test1, Subject_MidTerm_Max, etc.
                        var match = Regex.Match(columnName, @"^(.+)_(Test\d+|MidTerm|HouseExam)(_Max)?$", RegexOptions.IgnoreCase);
                        if (match.Success)
                        {
                            var subjectName = match.Groups[1].Value.Trim();
                            var examType = match.Groups[2].Value.Trim();
                            var isMaxMarks = match.Groups[3].Success;

                            if (!subjectsMap.TryGetValue(subjectName, out var subjectMarks))
                            {
                                subjectMarks = new SubjectMarks { SubjectName = subjectName };
                                subjectsMap[subjectName] = subjectMarks;
                            }

                            var cellValue = row[c];
                            double? numericValue = null;
                            if (cellValue != DBNull.Value && cellValue != null)
                            {
                                if (double.TryParse(cellValue.ToString(), out double parsedDouble))
                                {
                                    numericValue = parsedDouble;
                                }
                            }

                            if (string.Equals(examType, "MidTerm", StringComparison.OrdinalIgnoreCase))
                            {
                                if (isMaxMarks)
                                {
                                    subjectMarks.MidTerm.MaxMarks = numericValue ?? 100;
                                }
                                else
                                {
                                    subjectMarks.MidTerm.Marks = numericValue;
                                }
                            }
                            else if (string.Equals(examType, "HouseExam", StringComparison.OrdinalIgnoreCase))
                            {
                                if (isMaxMarks)
                                {
                                    subjectMarks.HouseExam.MaxMarks = numericValue ?? 100;
                                }
                                else
                                {
                                    subjectMarks.HouseExam.Marks = numericValue;
                                }
                            }
                            else if (examType.StartsWith("Test", StringComparison.OrdinalIgnoreCase))
                            {
                                if (int.TryParse(examType.Substring(4), out int testNumber))
                                {
                                    var existingTest = subjectMarks.ClassTests.Find(t => t.TestNumber == testNumber);
                                    if (isMaxMarks)
                                    {
                                        if (existingTest != null)
                                        {
                                            existingTest.MaxMarks = numericValue ?? 20;
                                        }
                                        else
                                        {
                                            subjectMarks.ClassTests.Add(new ClassTest
                                            {
                                                TestNumber = testNumber,
                                                MaxMarks = numericValue ?? 20,
                                                Marks = 0
                                            });
                                        }
                                    }
                                    else
                                    {
                                        if (numericValue.HasValue)
                                        {
                                            if (existingTest != null)
                                            {
                                                existingTest.Marks = numericValue.Value;
                                            }
                                            else
                                            {
                                                subjectMarks.ClassTests.Add(new ClassTest
                                                {
                                                    TestNumber = testNumber,
                                                    Marks = numericValue.Value,
                                                    MaxMarks = 20 // Default max
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    studentRow.Marks.AddRange(subjectsMap.Values);
                    parsedRows.Add(studentRow);
                }
            }

            return parsedRows;
        }

        private string GetRowStringValue(DataRow row, Dictionary<string, int> headerMap, string[] searchKeys)
        {
            foreach (var key in searchKeys)
            {
                var cleanedKey = key.Replace(" ", "").Replace("_", "").Replace("-", "").ToLower();
                if (headerMap.TryGetValue(cleanedKey, out int colIdx))
                {
                    var val = row[colIdx];
                    return val == DBNull.Value ? string.Empty : val?.ToString()?.Trim() ?? string.Empty;
                }
            }
            return string.Empty;
        }

        private double? GetRowDoubleValue(DataRow row, Dictionary<string, int> headerMap, string[] searchKeys)
        {
            foreach (var key in searchKeys)
            {
                var cleanedKey = key.Replace(" ", "").Replace("_", "").Replace("-", "").ToLower();
                if (headerMap.TryGetValue(cleanedKey, out int colIdx))
                {
                    var val = row[colIdx];
                    if (val == DBNull.Value || val == null) return null;
                    if (double.TryParse(val.ToString(), out double doubleVal))
                    {
                        return doubleVal;
                    }
                }
            }
            return null;
        }
    }
}
