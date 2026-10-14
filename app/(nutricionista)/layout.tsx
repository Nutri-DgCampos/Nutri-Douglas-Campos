"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

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
    } = await api.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: paciente } = await api
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