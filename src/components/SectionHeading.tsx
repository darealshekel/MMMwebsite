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
      className="text-center mb-12"
    >
      {tag && (
        <span className="inline-block px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary border border-primary/30 rounded-full bg-primary/5 mb-4">
          {tag}
        </span>
      )}
      <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-3">{title}</h2>
      {description && (
        <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">{description}</p>
      )}
    </motion.div>
  );
}
