import { redirect } from "next/navigation";
import { isAllowedScalerEmail } from "@/lib/auth/config";
import { getCachedUser, getCachedUserRole } from "@/lib/auth/cached-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const user = await getCachedUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCachedUserRole(user);

  if (role === "admin") {
    redirect("/admin");
  } else {
    if (isAllowedScalerEmail(user.email)) {
      redirect("/student");
    } else {
      redirect("/login?error=scaler_domain_required");
    }
  }
}
