import Link from "next/link";
import type { ReactNode } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export interface StaticSection {
  id: string;
  title: string;
  body: ReactNode;
}

interface StaticPageProps {
  title: string;
  lead?: string;
  sections: StaticSection[];
  children?: ReactNode;
}

/** Оболочка статичной страницы: крошки, h1, оглавление, секции в одну колонку max-w-3xl (Блок 4). */
export function StaticPage({ title, lead, sections, children }: StaticPageProps) {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Главная</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <article className="flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          {lead ? <p className="text-base text-silver">{lead}</p> : null}
        </header>

        {sections.length > 2 ? (
          <nav aria-label="Содержание" className="rounded-lg border border-border bg-card p-4">
            <p className="mb-2 text-sm font-medium">Содержание</p>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-silver">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="max-md:inline-flex max-md:min-h-11 max-md:items-center hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        {sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="flex scroll-mt-20 flex-col gap-3">
            <h2 id={`${s.id}-h`} className="text-xl font-semibold tracking-tight">
              {s.title}
            </h2>
            <div className="flex flex-col gap-3 text-base leading-7 text-silver [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
              {s.body}
            </div>
          </section>
        ))}
        {children}
      </article>
    </div>
  );
}
