import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data attributions | NurseDex",
  description:
    "The third party datasets NurseDex uses, and the licenses they are used under.",
};

/**
 * Where the attribution obligations of the datasets NurseDex ships actually
 * get honoured. GeoNames postal data is CC BY 4.0: attribution has to reach
 * users, not just sit in a migration comment (#772).
 */
export default function AttributionsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="font-heading text-soft-black text-2xl font-semibold sm:text-3xl">
          Data attributions
        </h1>
        <p className="text-soft-black-light mt-2 text-sm">
          NurseDex uses the datasets below. Each is listed with the license it
          is used under.
        </p>

        <section className="border-sage/20 mt-8 rounded-2xl border bg-white p-6">
          <h2 className="font-heading text-soft-black text-lg font-medium">
            Postal codes, towns and counties
          </h2>
          <p className="text-soft-black-light mt-2 text-sm">
            New York zip codes, their towns, counties and coordinates come from{" "}
            <a
              href="https://www.geonames.org/"
              className="text-teal underline underline-offset-2"
              rel="noopener noreferrer"
              target="_blank"
            >
              GeoNames
            </a>
            , used under the{" "}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              className="text-teal underline underline-offset-2"
              rel="noopener noreferrer"
              target="_blank"
            >
              Creative Commons Attribution 4.0 license
            </a>
            . We use this data to work out how far a nurse is from you and to
            show the town a nurse works in. NurseDex has not modified the
            coordinates, apart from rounding them to four decimal places.
          </p>
          <p className="text-soft-black-light mt-3 text-sm">
            A small number of zip codes, mostly PO box only ones, are not in
            that dataset. When we cannot locate a zip code you enter, we say so
            on the search page rather than quietly showing you nothing.
          </p>
        </section>
      </main>
    </div>
  );
}
