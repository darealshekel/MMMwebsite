import { motion } from "framer-motion";

interface SectionHeadingProps {
  tag?: string;
  title: string;
  description?: string;
}

export function SectionHeading({ tag, title, description }: SectionHeadingProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="mb-8"
    >
      {tag && (
        <span className="mb-3 inline-flex items-center border border-primary/30 bg-primary/10 px-3 py-1.5 text-[8px] uppercase tracking-[0.12em] text-primary">
          {tag}
        </span>
      )}
      <h2 className="pixel-heading mb-3 text-xl text-foreground md:text-[2rem]">{title}</h2>
      {description && (
        <p className="max-w-[60ch] text-[10px] leading-[1.8] text-muted-foreground md:text-[11px]">{description}</p>
      )}
    </motion.div>
  );
}
