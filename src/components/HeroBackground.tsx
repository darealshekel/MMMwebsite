import { useEffect, useRef, useState } from "react";

export function HeroBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => setVideoLoaded(true);
    video.addEventListener("canplay", handleCanPlay);

    // Ensure autoplay works
    video.play().catch(() => {
      // Autoplay blocked — poster image will show
    });

    return () => {
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Video background */}
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        poster="/hero-poster.jpg"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
          videoLoaded ? "opacity-100" : "opacity-0"
        }`}
      >
        <source src="/hero-video.mp4" type="video/mp4" />
      </video>

      {/* Poster fallback while video loads */}
      {!videoLoaded && (
        <img
          src="/hero-poster.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          width={1920}
          height={1080}
        />
      )}

      {/* Dark glass overlay for readability */}
      <div className="absolute inset-0 bg-[rgba(10,10,20,0.55)] backdrop-blur-[2px]" />

      {/* Subtle glow accents */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/8 rounded-full blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/8 rounded-full blur-[100px]" />

      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/60" />
    </div>
  );
}
