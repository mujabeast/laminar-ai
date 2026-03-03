import Link from "next/link";

export function ProfileRequired({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl">
        <section className="panel space-y-4">
          <p className="eyebrow">Laminar.AI</p>
          <h1 className="section-title">{title}</h1>
          <p className="section-copy">{description}</p>
          <Link className="button-primary" href="/">
            Choose profile
          </Link>
        </section>
      </div>
    </main>
  );
}
