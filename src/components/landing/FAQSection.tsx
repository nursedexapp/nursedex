import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type FAQSectionProps = {
  role: "nurse" | "family";
};

const faqs = {
  shared: [
    {
      question: "What areas does NurseDex cover?",
      answer:
        "NurseDex is focused on Long Island, serving Nassau County, Suffolk County, and Queens. We are built specifically for this community.",
    },
    {
      question: "How is NurseDex different from an agency?",
      answer:
        "Agencies take a cut of caregiver pay and control the relationship. NurseDex lets families and caregivers connect directly. Caregivers set their own rates and keep 100% of what they earn.",
    },
    {
      question: "When does NurseDex launch?",
      answer:
        "We are in the final stages of building NurseDex. Join the waitlist and you will be the first to know when we go live.",
    },
  ],
  nurse: {
    question: "Is NurseDex free?",
    answer:
      "It is free for caregivers to create a profile and be discovered by families. Featured listings are available if you want top placement in search results. Families pay a separate monthly subscription to unlock your contact information.",
  },
  family: {
    question: "Is NurseDex free?",
    answer:
      "Families pay a monthly subscription to unlock caregiver contact information. Caregivers create profiles for free, so there is a wide selection of verified professionals to browse.",
  },
};

export function FAQSection({ role }: FAQSectionProps) {
  const roleFaq = faqs[role];
  const allFaqs = [roleFaq, ...faqs.shared];

  return (
    <section className="bg-white px-6 py-20 border-t border-sage-light/40">
      <div className="mx-auto max-w-2xl">
        <h2 className="font-heading text-3xl text-soft-black sm:text-4xl">
          Frequently asked questions
        </h2>

        <Accordion className="mt-12">
          {allFaqs.map((faq, i) => (
            <AccordionItem key={`${role}-${i}`} value={`${role}-${i}`}>
              <AccordionTrigger className="font-body text-left text-base font-medium text-soft-black">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="font-body text-soft-black-light">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
