import React, { useState, useEffect } from 'react';

interface Props {
  productId: string;
}

const badgeStyles: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  buy_now: {
    bg: 'bg-green-900/40 border-green-700/30',
    text: 'text-green-400',
    label: 'BUY NOW',
    icon: '✓',
  },
  wait: {
    bg: 'bg-yellow-900/40 border-yellow-700/30',
    text: 'text-yellow-400',
    label: 'WAIT',
    icon: '⏳',
  },
  track: {
    bg: 'bg-blue-900/40 border-blue-700/30',
    text: 'text-blue-400',
    label: 'TRACK',
    icon: '👁',
  },
};

export default function RecommendationBadge({ productId }: Props) {
  const [action, setAction] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);

  useEffect(() => {
    if (!productId) return;
    chrome.runtime.sendMessage(
      { type: 'GET_RECOMMENDATION', payload: { productId } },
      (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.success && response.data) {
          setAction(response.data.action);
          setConfidence(response.data.confidence);
        }
      }
    );
  }, [productId]);

  if (!action) return null;

  const style = badgeStyles[action] || badgeStyles.track;

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${style.bg} ${style.text}`}>
      <span>{style.icon}</span>
      <span>{style.label}</span>
    </div>
  );
}
