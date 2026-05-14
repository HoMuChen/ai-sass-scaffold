import { z } from "zod";

export const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(80).optional(),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  createdAt: z.string(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const activeOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});
export type ActiveOrganization = z.infer<typeof activeOrganizationSchema>;
