import { Link } from "react-router-dom";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { Footer } from "@/components/Footer";

const sections = [
  {
    n: "1",
    title: "Accepting the terms",
    body: "By accessing and using this platform, you agree to these terms and conditions. If you do not agree with any of them, please do not use the platform. MMM is a community-based platform.",
  },
  {
    n: "2",
    title: "Description of the service",
    body: "MMM (ManualMiningManiacs) is a community platform for Minecraft players focused on manual block-breaking statistics. It provides global leaderboards, session tracking, milestone and achievement systems, and detailed mining analytics. The platform encompasses the mmmaniacs.com website, the MMMod Minecraft mod, and a linked Discord community. Access to core features is free; optional supporter subscriptions unlock advanced analytics and overlay tools within the mod.",
  },
  {
    n: "3",
    title: "External payments and willfulness",
    body: "This platform does not process any payments directly. Financial contributions are managed entirely through external platforms. These contributions are always voluntary.",
  },
  {
    n: "4",
    title: "No refunds",
    body: "All payments made through our platform are final. We do not accept refunds for any subscription payments once the service has been rendered. Any attempt to initiate a chargeback or payment dispute through your bank, card issuer, or payment provider without first contacting us will be considered a violation of these terms and will result in the immediate and permanent termination of your account and all associated access. If you believe you are entitled to a refund under the conditions described in our Privacy Policy, please contact us at public@mmmaniacs.com before opening any dispute.",
  },
  {
    n: "5",
    title: "Disclaimer regarding external platforms",
    body: "MMM does not control or assume responsibility for the policies, terms, fees, outages, or issues of external services such as PayPal, Microsoft, Mojang or others. Use of these platforms is subject to their own terms of service. Any issues with payments or transactions must be resolved through this email: public@mmmaniacs.com or directly with the respective platform.",
  },
  {
    n: "6",
    title: "User behavior",
    body: "Users agree to use the platform respectfully and in accordance with the law. Malicious use, posting offensive content, manipulating data, automation, or any other action that harms the experience of other users is prohibited.",
  },
  {
    n: "7",
    title: "Intellectual property",
    body: "The content of this website (design, text, mechanics) is the property of its creator. External brands mentioned (Discord, Mojang, etc.) are the property of their respective owners. User-generated content on the platform is the responsibility of its creator.",
  },
  {
    n: "8",
    title: "Service availability",
    body: "We do not guarantee continuous availability of the platform. We reserve the right to perform maintenance, modifications, or interruptions without prior notice. We are not liable for losses resulting from temporary service unavailability.",
  },
  {
    n: "9",
    title: "Underage users",
    body: "This platform is intended for users aged 13 and over. If you are under 18, please ensure you have the consent of your parents or guardians to use the service and to make any financial contribution.",
  },
  {
    n: "10",
    title: "Modifications",
    body: "We reserve the right to modify these terms at any time. Changes will be posted on this page with the date of the update. Continued use of the platform after changes are posted constitutes acceptance of the new terms.",
  },
];

export default function TermsAndConditions() {
  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />
      <main className="container py-16 max-w-3xl">
        <div className="mb-10 space-y-2">
          <div className="font-pixel text-[8px] uppercase tracking-[0.2em] text-primary">LEGAL</div>
          <h1 className="font-pixel text-3xl text-foreground">
            Terms &amp; Conditions<span className="text-primary animate-blink">_</span>
          </h1>
          <p className="font-pixel text-[8px] text-muted-foreground">Updated 5/2026</p>
        </div>

        <div className="space-y-8">
          {sections.map((s) => (
            <div key={s.n} className="space-y-2 border-l-2 border-border pl-5">
              <div className="font-pixel text-[8px] uppercase tracking-[0.14em] text-primary">{s.n}.</div>
              <h2 className="font-pixel text-[13px] text-foreground">{s.title}</h2>
              <p className="font-pixel text-[9px] leading-[2] text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-6 font-pixel text-[8px] text-muted-foreground">
          Questions? Contact us at{" "}
          <a href="mailto:public@mmmaniacs.com" className="text-primary hover:underline">
            public@mmmaniacs.com
          </a>
          {" · "}
          <Link to="/privacy" className="text-primary hover:underline">
            Privacy Policy
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
