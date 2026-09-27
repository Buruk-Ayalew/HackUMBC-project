import { z } from "zod";

// Validates the editable part of a BusinessProfile. id, userId and updatedAt
// are set by the server.
export const profileInput = z
  .object({
    businessName: z.string().trim().min(1, "Enter your business name."),
    address: z.string().trim().min(1, "Enter your business address."),
    // Rough Maryland bounding box, as a sanity check on geocoder output.
    lat: z.number().min(37.8).max(39.8),
    lng: z.number().min(-79.6).max(-75.0),
    jurisdiction: z.object({
      state: z.literal("MD"),
      county: z.string().min(1),
      isBaltimoreCity: z.boolean(),
      municipality: z.string().min(1).nullable(),
    }),
    entityType: z.enum([
      "sole_prop",
      "general_partnership",
      "llc",
      "corporation",
      "lp",
      "llp",
      "nonprofit",
      "other",
    ]),
    industry: z.string().min(1),
    naicsCode: z.string().regex(/^\d{2,6}$/).optional(),
    employees: z.object({
      totalAllStates: z.number().int().min(0).max(1_000_000),
      inMaryland: z.number().int().min(0),
      fullTimeInMaryland: z.number().int().min(0),
      coveredByFMLA: z.enum(["yes", "no", "unsure"]),
    }),
    flags: z.object({
      tippedEmployees: z.boolean(),
      sellsTaxableGoods: z.boolean(),
      chargesAdmission: z.boolean(),
      rentsLodging: z.boolean(),
      servesAlcohol: z.boolean(),
      sellsToGovernment: z.boolean(),
      handlesCustomerData: z.boolean(),
      servesFood: z.boolean().optional(),
      ownsBusinessProperty: z.boolean().optional(),
      usesTradeName: z.boolean().optional(),
      meetsPrivacyThreshold: z.boolean().optional(),
    }),
  })
  .refine((p) => p.employees.inMaryland <= p.employees.totalAllStates, {
    message: "Employees in Maryland can't be more than your total employees.",
  })
  .refine((p) => p.employees.fullTimeInMaryland <= p.employees.inMaryland, {
    message: "Full-time employees can't be more than your Maryland employees.",
  })
  .refine((p) => p.jurisdiction.isBaltimoreCity === (p.jurisdiction.county === "Baltimore City"), {
    message: "Your location details don't match. Look up the address again.",
  });
