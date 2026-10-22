import { auth } from "@/auth";
import { logoutAction } from "@/lib/auth-actions";

export default async function AccountPage() {
  const session = await auth();

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-4 py-16">
      <h1 className="text-xl font-semibold">Mi cuenta</h1>
      <p>{session?.user.email}</p>
      <p>Rol: {session?.user.role}</p>
      <form action={logoutAction}>
        <button type="submit" className="min-h-11 border px-4 py-2">
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
