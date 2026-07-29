import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const deleteInput = z.object({
  id: z.string().uuid(),
  passcode: z.string().min(1).max(200),
});

export const deleteRegistrationFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => deleteInput.parse(data))
  .handler(async ({ data }) => {
    const expected = process.env.REGISTRATION_ADMIN_PASSCODE;
    if (!expected || data.passcode !== expected) {
      throw new Error("Unauthorized");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("registrations").delete().eq("id", data.id);
    if (error) throw new Error("Delete failed");
    return { ok: true };
  });
