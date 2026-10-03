"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAuthGateway } from "@/lib/auth-client";

/** «Выйти»: supabase.auth.signOut() → / (Блок 4, «Личный кабинет»). */
export function SignOutButton({ fixtures }: { fixtures: boolean }) {
  const router = useRouter();
  const gateway = useMemo(() => getAuthGateway(fixtures), [fixtures]);
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    const res = await gateway.signOut();
    if (!res.ok) {
      setPending(false);
      toast.error("Не удалось выйти. Повторите попытку");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={signOut}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
      Выйти
    </Button>
  );
}
