import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

async function loginWithCredentials(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=credenciales");
    }
    throw error;
  }
}

async function loginWithGoogleAction() {
  "use server";
  await signIn("google", { redirectTo: "/" });
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const hasError = params.error === "credenciales";

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 px-4 py-16">
      <h1 className="text-xl font-semibold">Iniciar sesión</h1>
      {hasError ? <p className="text-red-600">Correo o contraseña incorrectos.</p> : null}
      <form action={loginWithCredentials} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span>Correo</span>
          <input name="email" type="email" required className="min-h-11 border px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span>Contraseña</span>
          <input name="password" type="password" required className="min-h-11 border px-3 py-2" />
        </label>
        <button type="submit" className="min-h-11 bg-ink text-white px-4 py-2">
          Entrar
        </button>
      </form>
      <form action={loginWithGoogleAction}>
        <button type="submit" className="border px-4 py-2 w-full">
          Continuar con Google
        </button>
      </form>
    </main>
  );
}
