"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function NutricionistaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
  async function verificarAcesso() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: paciente } = await supabase
      .from("patients")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (paciente) {
      router.push("/area-paciente");
      return;
    }
  }

  verificarAcesso();
}, [router]);

  return <>{children}</>;
}