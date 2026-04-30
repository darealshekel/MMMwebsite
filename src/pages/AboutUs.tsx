import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Footer } from "@/components/Footer";
import { GlassCard } from "@/components/GlassCard";
import { LeaderboardHeader } from "@/components/leaderboard/LeaderboardHeader";
import { PlayerAvatar } from "@/components/leaderboard/PlayerAvatar";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};

const team = [
  {
    username: "Iktsoi",
    role: "Owner & Founder",
    stats: [
      "230M+ Blocks Mined",
      "10,000 hours played",
      "Top #3 in Digs",
      "Top #1 in Nether Digs",
    ],
  },
  {
    username: "Ant_ig",
    role: "Admin & Founder",
    stats: [
      "130M+ Blocks Mined",
      "8,000 hours played",
      "Top #6 in Digs",
      "Top #1 using the Shovel",
    ],
  },
  {
    username: "akaNear",
    role: "Founder",
    stats: [
      "34M+ Blocks Mined",
      "Logo Designer",
      "Retired Archiver",
      "Discord Admin",
    ],
  },
  {
    username: "5hekel",
    role: "Dev",
    stats: [
      "Main Web & Mod Developer",
      "Head of Mod Team",
      "Submit Manager",
      "Archiver",
    ],
  },
  {
    username: "SheronMan",
    role: "Acoustic",
    stats: [
      "285M+ Blocks Mined",
      "19,000 hours played",
      "Top #1 in Digs and SSP Digs",
      "Achievements Manager",
    ],
  },
];

type Slide = { src: string; credit: string };

function SlideshowImage({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const slide = slides[index];

  return (
    <div className="relative flex h-64 w-full items-end overflow-hidden border border-border md:h-80">
      <AnimatePresence mode="wait">
        <motion.img
          key={slide.src}
          src={slide.src}
          alt={slide.credit}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
      <div className="relative z-10 flex w-full items-end justify-between px-4 py-3">
        <AnimatePresence mode="wait">
          <motion.p
            key={slide.credit}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="font-pixel text-[7px] leading-[1.6] text-muted-foreground"
          >
            {slide.credit}
          </motion.p>
        </AnimatePresence>
        {slides.length > 1 && (
          <div className="flex shrink-0 items-center gap-1.5 pl-3">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-1.5 transition-all duration-300 ${i === index ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70"}`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AboutUs() {
  return (
    <div className="min-h-screen bg-background">
      <LeaderboardHeader />

      {/* Hero */}
      <section className="relative overflow-hidden grid-bg border-b border-border">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/0 via-background/10 to-background" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="container relative z-10 py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-5"
          >
            <div className="inline-flex items-center gap-2 border border-primary/30 bg-primary/10 px-3 py-1.5 text-primary">
              <span className="font-pixel text-[9px]">ABOUT US</span>
            </div>
            <h1 className="font-pixel text-4xl leading-tight text-foreground md:text-5xl">
              Manual Mining<br />Maniacs
              <span className="text-primary animate-blink">_</span>
            </h1>
            <p className="mx-auto max-w-2xl font-display text-2xl leading-snug text-foreground/70">
              We are a project with a clear objective — to archive every mining achievement in the game.
            </p>
          </motion.div>
        </div>
      </section>

      <main className="container space-y-0 divide-y divide-border">

        {/* Why? */}
        <section className="grid gap-10 py-16 md:grid-cols-2 md:items-center">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45 }}
            className="space-y-5"
          >
            <div className="font-pixel text-[8px] uppercase tracking-[0.2em] text-primary">WHY?</div>
            <h2 className="font-pixel text-2xl leading-[1.4] text-foreground">
              Why does MMM exist?
            </h2>
            <p className="text-[10px] leading-[1.9] text-foreground/70">
              Our mission is to archive the most important achievements, embrace competition, and create meaningful, lasting impact through everything we archive. Driven by a vision to inspire change, push boundaries, we archive what truly makes a difference.
            </p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <SlideshowImage slides={[
              { src: "https://mclarchive.com/wp-content/uploads/2025/03/default_2024-03-07_20-29-03-1000.png", credit: "Credits: this build was designed by Yuno for Sheron's SSP." },
              { src: "https://mlarchivecom.wordpress.com/wp-content/uploads/2026/04/mw-snowflake-perimeter.png", credit: "Credits: this perimeter is from MineWave." },
              { src: "https://mlarchivecom.wordpress.com/wp-content/uploads/2026/04/ae-guardian-farm.png", credit: "Credits: this build was designed by Chirimoya and Kassius, made in Aeternum." },
            ]} />
          </motion.div>
        </section>

        {/* Show us how good you are */}
        <section className="grid gap-10 py-16 md:grid-cols-2 md:items-center">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="order-last md:order-first"
          >
            <SlideshowImage slides={[
              { src: "https://mclarchive.com/wp-content/uploads/2024/06/2024-06-03_14.png", credit: "Credits: this build was made in Amateras MS designed by Araya." },
              { src: "https://mlarchivecom.wordpress.com/wp-content/uploads/2026/04/ae-gold-farm.png", credit: "Credits: this build was designed by xCiga, made in Aeternum." },
            ]} />
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45 }}
            className="space-y-5"
          >
            <div className="font-pixel text-[8px] uppercase tracking-[0.2em] text-primary">RECORDS</div>
            <h2 className="font-pixel text-2xl leading-[1.4] text-foreground">
              Show us how good you are
            </h2>
            <p className="text-[10px] leading-[1.9] text-foreground/70">
              If you have a record you can submit your proof or install our mod to keep track of your digging achievements. Our mod team will review your submission and ask for additional information when needed.
            </p>
            <Link to="/submit">
              <button className="btn-glow mt-2 border border-primary/40 bg-primary/10 px-5 py-2.5 font-pixel text-[9px] text-primary transition-colors hover:bg-primary/20">
                GET STARTED
              </button>
            </Link>
          </motion.div>
        </section>

        {/* The Team */}
        <section className="py-16">
          <div className="mb-10 text-center">
            <div className="font-pixel text-[8px] uppercase tracking-[0.2em] text-primary mb-2">THE TEAM</div>
            <h2 className="font-pixel text-2xl text-foreground">The people behind MMM</h2>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          >
            {team.map((member) => (
              <motion.div key={member.username} variants={fadeUp} transition={{ duration: 0.35 }}>
                <GlassCard className="flex h-full flex-col items-center gap-4 p-5 text-center">
                  <div className="h-14 w-14 overflow-hidden border border-border bg-secondary">
                    <PlayerAvatar
                      username={member.username}
                      skinFaceUrl={`https://nmsr.nickac.dev/face/${encodeURIComponent(member.username)}`}
                      className="h-full w-full border-0 bg-transparent"
                      fallbackClassName="text-[10px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="font-pixel text-[11px] text-foreground">{member.username}</div>
                    <div className="font-pixel text-[8px] uppercase tracking-[0.12em] text-primary">{member.role}</div>
                  </div>
                  <ul className="mt-auto w-full space-y-1.5 border-t border-border pt-3">
                    {member.stats.map((stat) => (
                      <li key={stat} className="font-pixel text-[8px] leading-[1.6] text-muted-foreground">
                        {stat}
                      </li>
                    ))}
                  </ul>
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
