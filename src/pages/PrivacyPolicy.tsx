import { Link } from "react-router-dom";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { Footer } from "@/components/Footer";

const sections = [
  {
    n: "1",
    title: "Data Controller",
    body: "This website, operated under the name MMManiacs (www.mmmaniacs.com), is a gaming community platform built around competitivity — our goal is to push rivalry to the top, make every player's effort and achievements known, and create a space where competition drives the community forward. The platform is linked to gaming and streaming content, including an active Discord server and moderation team. We do not actively collect personal data beyond what is strictly necessary for the platform to function.",
  },
  {
    n: "2",
    title: "Data we collect",
    body: "When you log in through external providers (Discord), we only receive the data those services share with us: username, email address, and profile picture. We do not access passwords or payment data under any circumstances. Through our Minecraft mod, we may collect non-sensitive gameplay data such as session information, in-game activity, and mod-related statistics. This data is collected solely to provide and improve the mod experience and does not include any sensitive personal information.",
  },
  {
    n: "3",
    title: "Payments and external transactions",
    body: "MMManiacs is only responsible for payments made directly to us through our own platform. For any transactions processed through third-party platforms (PayPal), those platforms are solely responsible for the handling of your payment data. MMManiacs has no access to bank details, credit cards, or any payment information processed externally.",
  },
  {
    n: "4",
    title: "Voluntary nature of payments",
    body: "Any financial contribution made through external platforms linked to this project (donations, subscriptions, tips, etc.) is entirely voluntary. There is no obligation to pay to access the content on this website. Voluntary payments do not generate any contractual rights over the services or content offered.",
  },
  {
    n: "5",
    title: "No refunds",
    body: "All payments made through our platform are made in exchange for a specific service, which will be delivered. As such, we do not accept refunds once a service has been rendered. The only exception is if MMManiacs fails to deliver the agreed service within the time period you paid for — in that case, a full refund will be issued. Refund requests based on any other reason will not be accepted.",
  },
  {
    n: "6",
    title: "Use of data",
    body: "Session data is used exclusively to identify you on the platform, allow you to vote, participate in community features, and access functions reserved for registered users. We do not share your data with third parties or use it for advertising purposes. Your data may also be visible to MMManiacs moderators solely for the purposes of community management and enforcement of our Discord server rules. Moderators are bound to handle any data responsibly and confidentially.",
  },
  {
    n: "7",
    title: "Cookies and local storage",
    body: "We use session cookies necessary for the login system to function. We also use localStorage to remember your votes or preferences if you are not logged in. We do not use tracking or advertising cookies.",
  },
  {
    n: "8",
    title: "Data retention",
    body: "We only retain data that is strictly necessary for platform operation, including login credentials, Minecraft session data, and other essential information required to provide our services. Any additional data collected during use of the platform will be deleted once it has served its purpose and is no longer needed.",
  },
  {
    n: "9",
    title: "Your rights",
    body: "You have the right to access and appeal any information we hold about you. If you believe any data we have collected is inaccurate or unjustified, you may contest it through the channels available on the platform or via our Discord server. However, please note that any data collected with your permission cannot be selectively deleted through a standard request. The only way to request full deletion of all data associated with your account is through the process described in Section 12.",
  },
  {
    n: "10",
    title: "Discord server",
    body: "Our Discord server (discord.mmmaniacs.com) is governed by Discord's own Privacy Policy and Terms of Service. MMManiacs moderators may take actions (warnings, kicks, bans) based on behavior within the server in accordance with our community rules. We do not store Discord message content outside of Discord's own platform.",
  },
  {
    n: "11",
    title: "Changes to this policy",
    body: "We reserve the right to update this privacy policy at any time. Changes will be communicated through the website and/or the Discord server. Continued use of the site after changes implies acceptance of the new policy.",
  },
  {
    n: "12",
    title: "Personal data requests",
    body: "You may request a copy of all data associated with your account, or request its complete deletion, by emailing public@mmmaniacs.com. We will respond to your request within a maximum of 30 days. ⚠️ Important notice: Requesting the deletion of your data results in the permanent removal of your account, progress, and any associated community data. This action cannot be undone.",
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />
      <main className="container py-16 max-w-3xl">
        <div className="mb-10 space-y-2">
          <div className="font-pixel text-[8px] uppercase tracking-[0.2em] text-primary">LEGAL</div>
          <h1 className="font-pixel text-3xl text-foreground">
            Privacy Policy<span className="text-primary animate-blink">_</span>
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
          <Link to="/terms" className="text-primary hover:underline">
            Terms &amp; Conditions
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
