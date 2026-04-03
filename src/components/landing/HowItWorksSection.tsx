import { Search, UserCheck, Heart, ClipboardList, Eye, Users } from "lucide-react";

type HowItWorksSectionProps = {
  role: "nurse" | "family";
};

const steps = {
  family: [
    {
      icon: Search,
      title: "Browse profiles",
      description:
        "Search by care type, location, and availability. Every caregiver on NurseDex is verified and reviewed.",
    },
    {
      icon: UserCheck,
      title: "Unlock contact info",
      description:
        "Found the right fit? Unlock their phone number and email to reach out directly. No middleman.",
    },
    {
      icon: Heart,
      title: "Hire with confidence",
      description:
        "Read real reviews from other families, track your hires, and find care that truly fits.",
    },
  ],
  nurse: [
    {
      icon: ClipboardList,
      title: "Create your profile",
      description:
        "Showcase your credentials, specialties, availability, and rates. Add photos and a personal bio.",
    },
    {
      icon: Eye,
      title: "Get discovered",
      description:
        "Families on Long Island search NurseDex to find caregivers like you. Featured profiles get top placement.",
    },
    {
      icon: Users,
      title: "Build your client base",
      description:
        "Families contact you directly. No agency fees, no commission. You keep 100% of what you earn.",
    },
  ],
};

export function HowItWorksSection({ role }: HowItWorksSectionProps) {
  const currentSteps = steps[role];

  return (
    <section className="bg-sage-light/20 px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl">
        <h2 className="font-heading text-3xl text-soft-black sm:text-4xl">
          How NurseDex works
        </h2>
        <p className="mt-3 font-body text-soft-black-light">
          {role === "family"
            ? "Three steps to finding the right caregiver."
            : "Three steps to growing your practice."}
        </p>

        <div className="mt-10 space-y-0">
          {currentSteps.map((step, i) => (
            <div key={step.title} className="relative flex gap-6">
              {/* Number column with connecting line */}
              <div className="flex flex-col items-center">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-teal bg-white">
                  <span className="font-heading text-lg text-teal">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                {i < currentSteps.length - 1 && (
                  <div className="w-px flex-1 bg-sage-light" />
                )}
              </div>

              {/* Content */}
              <div className={i === currentSteps.length - 1 ? "" : "pb-8"}>
                <div className="flex items-center gap-3">
                  <step.icon className="h-5 w-5 text-teal-light" />
                  <h3 className="font-heading text-xl text-soft-black">
                    {step.title}
                  </h3>
                </div>
                <p className="mt-2 font-body leading-relaxed text-soft-black-light">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
