import { sendVerificationEmail } from "./emailService.js";

interface EmailJob {
  email: string;
  token: string;
  retries: number;
}

const queue: EmailJob[] = [];
let isProcessing = false;

// 500ms delay between sending emails to prevent hitting rate limits
const DELAY_BETWEEN_EMAILS_MS = 500;
const MAX_RETRIES = 3;

/**
 * Processes the queue of emails sequentially.
 */
async function processQueue(): Promise<void> {
  if (isProcessing || queue.length === 0) return;

  isProcessing = true;

  while (queue.length > 0) {
    const job = queue.shift();
    if (!job) continue;

    console.log(`[EMAIL QUEUE] Processing verification email job for: ${job.email} (Attempt ${job.retries + 1})`);

    try {
      await sendVerificationEmail(job.email, job.token);
      console.log(`[EMAIL QUEUE] Successfully processed email for: ${job.email}`);
    } catch (error) {
      console.error(`[EMAIL QUEUE] Error sending email to ${job.email}:`, error);

      if (job.retries < MAX_RETRIES - 1) {
        job.retries += 1;
        // Re-queue the job at the end for another try
        queue.push(job);
        console.log(`[EMAIL QUEUE] Re-queued job for: ${job.email} (Retries left: ${MAX_RETRIES - job.retries})`);
      } else {
        console.error(`[EMAIL QUEUE] Critical: Email to ${job.email} failed after ${MAX_RETRIES} attempts. Job discarded.`);
      }
    }

    // Wait for the specified delay before the next email send
    if (queue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_EMAILS_MS));
    }
  }

  isProcessing = false;
  console.log("[EMAIL QUEUE] Finished processing all queued emails.");
}

/**
 * Adds a new verification email job to the queue and starts processing.
 * @param email Recipient email address
 * @param token Account activation/verification token
 */
export function addEmailToQueue(email: string, token: string): void {
  if (!email || !token) {
    console.warn("[EMAIL QUEUE] Attempted to queue job with invalid email or token.");
    return;
  }

  queue.push({
    email,
    token,
    retries: 0,
  });

  console.log(`[EMAIL QUEUE] Job added to queue for: ${email}. Queue length: ${queue.length}`);

  // Trigger processing asynchronously
  processQueue().catch((err) => {
    console.error("[EMAIL QUEUE] Unhandled worker exception:", err);
  });
}
