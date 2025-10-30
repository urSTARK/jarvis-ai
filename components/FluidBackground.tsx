import React from 'react';

const FluidBackground: React.FC = () => {
  const stars = React.useMemo(() => {
    return Array.from({ length: 200 }).map((_, i) => ({
      id: i,
      x: `${Math.random() * 100}vw`,
      y: `${Math.random() * 100}vh`,
      size: `${Math.random() * 1.5 + 0.5}px`,
      opacity: Math.random() * 0.5 + 0.2,
      animationDuration: `${Math.random() * 5 + 5}s`,
      animationDelay: `${Math.random() * -5}s`, // Start at different points in the animation
    }));
  }, []);

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-black">
      {stars.map(star => (
        <div
          key={star.id}
          className="absolute rounded-full bg-slate-300"
          style={{
            left: star.x,
            top: star.y,
            width: star.size,
            height: star.size,
            '--start-opacity': star.opacity, // Custom property for keyframe
            opacity: star.opacity,
            animation: `twinkle ${star.animationDuration} infinite ease-in-out`,
            animationDelay: star.animationDelay,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
};

export default FluidBackground;