import { SignOutButton } from "@/components/shop/account/SignOutButton";

interface AccountHeaderProps {
  email: string | null;
  fixtures: boolean;
}

export function AccountHeader({ email, fixtures }: AccountHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">Аккаунт</h1>
        {email && <p className="mt-1 truncate text-sm text-muted-foreground">{email}</p>}
      </div>
      <SignOutButton fixtures={fixtures} />
    </div>
  );
}
