import React from 'react';

interface ClientProgressCircleProps {
  percentage: number;
}

const ClientProgressCircle: React.FC<ClientProgressCircleProps> = ({ percentage }) => {
  const size = 48; // SVG viewbox size
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  const progressColor = percentage === 100 ? 'text-green-500' : 'text-blue-600';
  const trackColor = 'text-slate-200';
  const textColor = percentage === 100 ? 'text-green-700' : 'text-slate-700';

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className={trackColor}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={progressColor}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
        />
      </svg>
      <span className={`absolute text-xs font-bold ${textColor}`}>
        {Math.round(percentage)}%
      </span>
    </div>
  );
};

export default ClientProgressCircle;
