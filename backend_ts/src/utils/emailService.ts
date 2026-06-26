import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.RESEND_API_KEY || "";
const hasKey = apiKey !== "" && apiKey !== "your_resend_api_key";

if (!hasKey) {
  console.warn(
    "[WARNING] RESEND_API_KEY environment variable is not defined. Falling back to console-logged verification emails."
  );
}

const resend = hasKey ? new Resend(apiKey) : null;

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verificationLink = `http://localhost:5173/verify?token=${token}&email=${encodeURIComponent(email)}`;

  if (resend) {
    try {
      await resend.emails.send({
        from: "EduGuard <onboarding@resend.dev>",
        to: email,
        subject: "Verify your EduGuard Account",
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; border: 1px solid #f0f0f0; border-radius: 8px;">
            <h2 style="color: #4f46e5; margin-bottom: 20px;">Welcome to EduGuard</h2>
            <p>Your college mentor has added you to the EduGuard Student Risk & Performance Management Portal.</p>
            <p>Please click the button below to verify your email, set a secure password, and activate your account:</p>
            <div style="margin: 30px 0; text-align: center;">
              <a href="${verificationLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Verify & Activate Account
              </a>
            </div>
            <p style="color: #64748b; font-size: 12px; margin-top: 30px;">
              If the button doesn't work, copy and paste the link below into your browser: <br/>
              <a href="${verificationLink}">${verificationLink}</a>
            </p>
          </div>
        `,
      });
      console.log(`[EMAIL SENT] Verification email successfully sent to ${email} via Resend.`);
    } catch (error) {
      console.error("[EMAIL ERROR] Resend failed to send email. Falling back to console log:", error);
      logMockEmail(email, verificationLink);
    }
  } else {
    logMockEmail(email, verificationLink);
  }
}

function logMockEmail(email: string, link: string) {
  console.log("\n==================================================");
  console.log(`[MOCK EMAIL SERVICE] To: ${email}`);
  console.log("Subject: Verify your EduGuard Account");
  console.log("--------------------------------------------------");
  console.log("Please click the link below to verify your account:");
  console.log(link);
  console.log("==================================================\n");
}
