import { RegisterSchema } from "@nexus/types";

export default function HomePage() {
  // Проверяем прямо на сервере, что общий пакет @nexus/types успешно импортировался!
  const schemaFieldsCount = Object.keys(RegisterSchema.shape).length;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold">
          N
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Nexus Frontend Ready
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Next.js 15 + Tailwind CSS v4 + Monorepo (@nexus/types полей в схеме:{" "}
          <span className="font-mono font-semibold text-indigo-400">
            {schemaFieldsCount}
          </span>
          )
        </p>
      </div>
    </main>
  );
}
