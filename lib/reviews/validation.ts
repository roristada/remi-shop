import { z } from "zod";
import { REVIEW_BODY_MAX } from "@/lib/reviews/rules";

// Messages are error codes mapped to `shop.reviews.errors.*` translation keys.
export const reviewInputSchema = z.object({
  productId: z.uuid(),
  rating: z.number().int().min(1, "rating").max(5, "rating"),
  body: z.string().trim().min(1, "required").max(REVIEW_BODY_MAX, "too_long"),
});

export type ReviewInput = z.input<typeof reviewInputSchema>;
