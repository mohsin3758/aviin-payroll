import { z } from "zod";
import { FACE_DESCRIPTOR_LENGTH } from "@/lib/face-match";

export const enrollFaceSchema = z.object({
  descriptor: z.array(z.number().finite()).length(FACE_DESCRIPTOR_LENGTH),
  consent: z.literal(true, { message: "Consent is required to enroll your face." }),
});
