import { z } from "zod";

export const sourceLocationSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
});

export const javaSymbolSchema = z.object({
  owner: z.string(),
  name: z.string(),
  parameterTypes: z.array(z.string()),
  returnType: z.string().optional(),
  signature: z.string(),
});

export const codeChangeSchema = z.object({
  changeType: z.enum([
    "method_signature_changed",
    "method_added",
    "method_removed",
  ]),
  element: z.literal("method"),
  oldSymbol: javaSymbolSchema.optional(),
  newSymbol: javaSymbolSchema.optional(),
  oldDeclaration: z.string().optional(),
  newDeclaration: z.string().optional(),
  oldLocation: sourceLocationSchema.optional(),
  newLocation: sourceLocationSchema.optional(),
  summary: z.string(),
});
