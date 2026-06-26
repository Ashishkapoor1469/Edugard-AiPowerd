export interface Student{
    _id:string;
     name: string;
      email?: string;
      class?: string;
      attendence: number | null;
      marks:{
        classTests:number[];
        midTerm : number;
        houseExam:number;
      }
      behavior: "good" | "average" | "bad" | null;
      contribution: string[];
      riskScore: number;
      riskLevel: "low" | "medium" | "high";
      riskExplanation: string;
}