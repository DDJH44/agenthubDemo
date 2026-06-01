import { z } from "zod";
export const messageSendSchema = z.object({ conversationId: z.string(), text: z.string().min(1).max(10000), attachments: z.array(z.string()).optional() });
