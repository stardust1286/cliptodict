import React, { useState } from 'react';

interface SelectionButtonProps {
  position: { x: number; y: number };
  onClick: () => void;
}

export default function SelectionButton({ position, onClick }: SelectionButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: 36,
        height: 36,
        borderRadius: '50%',
        backgroundColor: hovered ? '#4338ca' : '#4f46e5',
        color: '#ffffff',
        border: 'none',
        cursor: 'pointer',
        fontSize: 16,
        fontFamily: 'serif',
        lineHeight: '36px',
        textAlign: 'center',
        padding: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        zIndex: 999999,
        transition: 'background-color 0.1s ease',
        userSelect: 'none',
      }}
    >
      辞
    </button>
  );
}
