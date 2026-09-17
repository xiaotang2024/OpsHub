import React, { useState, useEffect, useRef } from 'react';

import gsap from 'gsap';

export interface PupilProps {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
  mouseX: number;
  mouseY: number;
}

export const Pupil: React.FC<PupilProps> = ({
  size = 12,
  maxDistance = 5,
  pupilColor = '#2D2D2D',
  forceLookX,
  forceLookY,
  mouseX,
  mouseY,
}) => {
  const pupilRef = useRef<HTMLDivElement>(null);

  const calculatePupilPosition = () => {
    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }
    if (!pupilRef.current) return { x: 0, y: 0 };

    const pupil = pupilRef.current.getBoundingClientRect();
    const pupilCenterX = pupil.left + pupil.width / 2;
    const pupilCenterY = pupil.top + pupil.height / 2;

    const deltaX = mouseX - pupilCenterX;
    const deltaY = mouseY - pupilCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);

    const angle = Math.atan2(deltaY, deltaX);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    return { x, y };
  };

  const pupilPosition = calculatePupilPosition();

  return (
    <div
      ref={pupilRef}
      className="rounded-full flex-shrink-0"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: pupilColor,
        transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
        transition: 'transform 0.1s ease-out',
      }}
    />
  );
};

export interface EyeBallProps {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
  mouseX: number;
  mouseY: number;
}

export const EyeBall: React.FC<EyeBallProps> = ({
  size = 48,
  pupilSize = 16,
  maxDistance = 10,
  eyeColor = 'white',
  pupilColor = '#2D2D2D',
  isBlinking = false,
  forceLookX,
  forceLookY,
  mouseX,
  mouseY,
}) => {
  const eyeRef = useRef<HTMLDivElement>(null);

  const calculatePupilPosition = () => {
    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }
    if (!eyeRef.current) return { x: 0, y: 0 };

    const eye = eyeRef.current.getBoundingClientRect();
    const eyeCenterX = eye.left + eye.width / 2;
    const eyeCenterY = eye.top + eye.height / 2;

    const deltaX = mouseX - eyeCenterX;
    const deltaY = mouseY - eyeCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);

    const angle = Math.atan2(deltaY, deltaX);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;

    return { x, y };
  };

  const pupilPosition = calculatePupilPosition();

  return (
    <div
      ref={eyeRef}
      className="rounded-full flex items-center justify-center transition-all duration-150 flex-shrink-0"
      style={{
        width: `${size}px`,
        height: isBlinking ? '2px' : `${size}px`,
        backgroundColor: eyeColor,
        overflow: 'hidden',
      }}
    >
      {!isBlinking && (
        <div
          className="rounded-full"
          style={{
            width: `${pupilSize}px`,
            height: `${pupilSize}px`,
            backgroundColor: pupilColor,
            transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
            transition: 'transform 0.1s ease-out',
          }}
        />
      )}
    </div>
  );
};

export interface AnimatedCharactersProps {
  isTyping?: boolean;
  showPassword?: boolean;
  passwordLength?: number;
  scale?: number;
  className?: string;
  onCharacterDoubleClick?: (characterIndex: 0 | 1 | 2 | 3) => void;
}

export const AnimatedCharacters: React.FC<AnimatedCharactersProps> = ({
  isTyping = false,
  showPassword = false,
  passwordLength = 0,
  scale = 1,
  className = '',
  onCharacterDoubleClick,
}) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isPurpleBlinking, setIsPurpleBlinking] = useState(false);
  const [isBlackBlinking, setIsBlackBlinking] = useState(false);
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isPurplePeeking, setIsPurplePeeking] = useState(false);
  const [bouncingIndex, setBouncingIndex] = useState<number | null>(null);

  const purpleRef = useRef<HTMLDivElement>(null);
  const blackRef = useRef<HTMLDivElement>(null);
  const orangeRef = useRef<HTMLDivElement>(null);
  const yellowRef = useRef<HTMLDivElement>(null);

  const characterRefs = [purpleRef, blackRef, orangeRef, yellowRef];

  const handleCharDoubleClick = (index: 0 | 1 | 2 | 3, e: React.MouseEvent) => {
    e.stopPropagation();
    const target = characterRefs[index]?.current;
    if (target) {
      gsap.killTweensOf(target);
      gsap.timeline()
        .to(target, { scaleY: 0.88, scaleX: 1.12, duration: 0.1, ease: 'power2.out' })
        .to(target, { y: -24, scaleY: 1.08, scaleX: 0.94, duration: 0.18, ease: 'power2.out' })
        .to(target, { y: 0, scaleY: 1, scaleX: 1, duration: 0.25, ease: 'bounce.out' });
    }
    setBouncingIndex(index);
    setTimeout(() => setBouncingIndex(null), 350);
    onCharacterDoubleClick?.(index);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Blinking effect for purple character
  useEffect(() => {
    let blinkTimer: NodeJS.Timeout;
    let resetTimer: NodeJS.Timeout;

    const scheduleBlink = () => {
      const interval = Math.random() * 4000 + 3000;
      blinkTimer = setTimeout(() => {
        setIsPurpleBlinking(true);
        resetTimer = setTimeout(() => {
          setIsPurpleBlinking(false);
          scheduleBlink();
        }, 150);
      }, interval);
    };

    scheduleBlink();
    return () => {
      clearTimeout(blinkTimer);
      clearTimeout(resetTimer);
    };
  }, []);

  // Blinking effect for black character
  useEffect(() => {
    let blinkTimer: NodeJS.Timeout;
    let resetTimer: NodeJS.Timeout;

    const scheduleBlink = () => {
      const interval = Math.random() * 4000 + 3000;
      blinkTimer = setTimeout(() => {
        setIsBlackBlinking(true);
        resetTimer = setTimeout(() => {
          setIsBlackBlinking(false);
          scheduleBlink();
        }, 150);
      }, interval);
    };

    scheduleBlink();
    return () => {
      clearTimeout(blinkTimer);
      clearTimeout(resetTimer);
    };
  }, []);

  // Looking at each other animation when typing starts
  useEffect(() => {
    if (isTyping) {
      setIsLookingAtEachOther(true);
      const timer = setTimeout(() => {
        setIsLookingAtEachOther(false);
      }, 800);
      return () => clearTimeout(timer);
    } else {
      setIsLookingAtEachOther(false);
    }
  }, [isTyping]);

  // Purple sneaky peeking animation when typing password and it is visible
  useEffect(() => {
    if (passwordLength > 0 && showPassword) {
      let peekTimer: NodeJS.Timeout;
      let resetTimer: NodeJS.Timeout;

      const schedulePeek = () => {
        const interval = Math.random() * 3000 + 2000;
        peekTimer = setTimeout(() => {
          setIsPurplePeeking(true);
          resetTimer = setTimeout(() => {
            setIsPurplePeeking(false);
            schedulePeek();
          }, 800);
        }, interval);
      };

      schedulePeek();
      return () => {
        clearTimeout(peekTimer);
        clearTimeout(resetTimer);
      };
    } else {
      setIsPurplePeeking(false);
    }
  }, [passwordLength, showPassword]);

  const calculatePosition = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (!ref.current) return { faceX: 0, faceY: 0, bodySkew: 0 };

    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 3;

    const deltaX = mousePos.x - centerX;
    const deltaY = mousePos.y - centerY;

    const faceX = Math.max(-15, Math.min(15, deltaX / 20));
    const faceY = Math.max(-10, Math.min(10, deltaY / 30));
    const bodySkew = Math.max(-6, Math.min(6, -deltaX / 120));

    return { faceX, faceY, bodySkew };
  };

  const purplePos = calculatePosition(purpleRef);
  const blackPos = calculatePosition(blackRef);
  const yellowPos = calculatePosition(yellowRef);
  const orangePos = calculatePosition(orangeRef);

  const isHidingPassword = passwordLength > 0 && !showPassword;

  return (
    <div
      data-testid="animated-characters-container"
      className={`relative select-none pointer-events-none flex items-end justify-center ${className}`}
      style={{
        width: '520px',
        height: '380px',
        transform: `scale(${scale})`,
        transformOrigin: 'bottom center',
      }}
    >
      {/* 1. Purple tall rectangle character - Back layer */}
      <div
        ref={purpleRef}
        data-testid="char-purple"
        onDoubleClick={(e) => handleCharDoubleClick(0, e)}
        title="双击切换【赛博深空极光】全屏背景"
        className="absolute bottom-0 transition-all duration-700 ease-in-out pointer-events-auto cursor-pointer hover:brightness-110"
        style={{
          left: '60px',
          width: '170px',
          height: isTyping || isHidingPassword ? '420px' : '380px',
          backgroundColor: '#6C3FF5',
          borderRadius: '16px 16px 0 0',
          zIndex: 1,
          transform:
            (passwordLength > 0 && showPassword
              ? 'skewX(0deg)'
              : isTyping || isHidingPassword
              ? `skewX(${(purplePos.bodySkew || 0) - 12}deg) translateX(35px)`
              : `skewX(${purplePos.bodySkew || 0}deg)`) +
            (bouncingIndex === 0 ? ' scale(1.08)' : ''),
          transformOrigin: 'bottom center',
          boxShadow: '0 8px 30px rgba(108, 63, 245, 0.3)',
        }}
      >
        {/* Eyes */}
        <div
          className="absolute flex gap-7 transition-all duration-700 ease-in-out"
          style={{
            left:
              passwordLength > 0 && showPassword
                ? '20px'
                : isLookingAtEachOther
                ? '55px'
                : `${42 + purplePos.faceX}px`,
            top:
              passwordLength > 0 && showPassword
                ? '35px'
                : isLookingAtEachOther
                ? '65px'
                : `${38 + purplePos.faceY}px`,
          }}
        >
          <EyeBall
            size={18}
            pupilSize={7}
            maxDistance={5}
            eyeColor="white"
            pupilColor="#2D2D2D"
            isBlinking={isPurpleBlinking}
            forceLookX={
              passwordLength > 0 && showPassword
                ? isPurplePeeking
                  ? 4
                  : -4
                : isLookingAtEachOther
                ? 3
                : undefined
            }
            forceLookY={
              passwordLength > 0 && showPassword
                ? isPurplePeeking
                  ? 5
                  : -4
                : isLookingAtEachOther
                ? 4
                : undefined
            }
            mouseX={mousePos.x}
            mouseY={mousePos.y}
          />
          <EyeBall
            size={18}
            pupilSize={7}
            maxDistance={5}
            eyeColor="white"
            pupilColor="#2D2D2D"
            isBlinking={isPurpleBlinking}
            forceLookX={
              passwordLength > 0 && showPassword
                ? isPurplePeeking
                  ? 4
                  : -4
                : isLookingAtEachOther
                ? 3
                : undefined
            }
            forceLookY={
              passwordLength > 0 && showPassword
                ? isPurplePeeking
                  ? 5
                  : -4
                : isLookingAtEachOther
                ? 4
                : undefined
            }
            mouseX={mousePos.x}
            mouseY={mousePos.y}
          />
        </div>
      </div>

      {/* 2. Black tall rectangle character - Middle layer */}
      <div
        ref={blackRef}
        data-testid="char-black"
        onDoubleClick={(e) => handleCharDoubleClick(1, e)}
        title="双击切换【天水雾蓝雅致】全屏背景"
        className="absolute bottom-0 transition-all duration-700 ease-in-out pointer-events-auto cursor-pointer hover:brightness-125"
        style={{
          left: '225px',
          width: '115px',
          height: '295px',
          backgroundColor: '#2D2D2D',
          borderRadius: '12px 12px 0 0',
          zIndex: 2,
          transform:
            (passwordLength > 0 && showPassword
              ? 'skewX(0deg)'
              : isLookingAtEachOther
              ? `skewX(${(blackPos.bodySkew || 0) * 1.5 + 10}deg) translateX(18px)`
              : isTyping || isHidingPassword
              ? `skewX(${(blackPos.bodySkew || 0) * 1.5}deg)`
              : `skewX(${blackPos.bodySkew || 0}deg)`) +
            (bouncingIndex === 1 ? ' scale(1.08)' : ''),
          transformOrigin: 'bottom center',
          boxShadow: '0 8px 25px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Eyes */}
        <div
          className="absolute flex gap-5 transition-all duration-700 ease-in-out"
          style={{
            left:
              passwordLength > 0 && showPassword
                ? '10px'
                : isLookingAtEachOther
                ? '30px'
                : `${24 + blackPos.faceX}px`,
            top:
              passwordLength > 0 && showPassword
                ? '28px'
                : isLookingAtEachOther
                ? '15px'
                : `${30 + blackPos.faceY}px`,
          }}
        >
          <EyeBall
            size={16}
            pupilSize={6}
            maxDistance={4}
            eyeColor="white"
            pupilColor="#2D2D2D"
            isBlinking={isBlackBlinking}
            forceLookX={
              passwordLength > 0 && showPassword
                ? -4
                : isLookingAtEachOther
                ? 0
                : undefined
            }
            forceLookY={
              passwordLength > 0 && showPassword
                ? -4
                : isLookingAtEachOther
                ? -4
                : undefined
            }
            mouseX={mousePos.x}
            mouseY={mousePos.y}
          />
          <EyeBall
            size={16}
            pupilSize={6}
            maxDistance={4}
            eyeColor="white"
            pupilColor="#2D2D2D"
            isBlinking={isBlackBlinking}
            forceLookX={
              passwordLength > 0 && showPassword
                ? -4
                : isLookingAtEachOther
                ? 0
                : undefined
            }
            forceLookY={
              passwordLength > 0 && showPassword
                ? -4
                : isLookingAtEachOther
                ? -4
                : undefined
            }
            mouseX={mousePos.x}
            mouseY={mousePos.y}
          />
        </div>
      </div>

      {/* 3. Orange semi-circle character - Front left */}
      <div
        ref={orangeRef}
        data-testid="char-orange"
        onDoubleClick={(e) => handleCharDoubleClick(2, e)}
        title="双击切换【熔岩落日余晖】全屏背景"
        className="absolute bottom-0 transition-all duration-700 ease-in-out pointer-events-auto cursor-pointer hover:brightness-110"
        style={{
          left: '0px',
          width: '230px',
          height: '190px',
          zIndex: 3,
          backgroundColor: '#FF9B6B',
          borderRadius: '115px 115px 0 0',
          transform:
            (passwordLength > 0 && showPassword
              ? 'skewX(0deg)'
              : `skewX(${orangePos.bodySkew || 0}deg)`) +
            (bouncingIndex === 2 ? ' scale(1.08)' : ''),
          transformOrigin: 'bottom center',
          boxShadow: '0 8px 25px rgba(255, 155, 107, 0.3)',
        }}
      >
        {/* Eyes - just pupils, no white */}
        <div
          className="absolute flex gap-7 transition-all duration-200 ease-out"
          style={{
            left:
              passwordLength > 0 && showPassword
                ? '48px'
                : `${78 + (orangePos.faceX || 0)}px`,
            top:
              passwordLength > 0 && showPassword
                ? '80px'
                : `${85 + (orangePos.faceY || 0)}px`,
          }}
        >
          <Pupil
            size={12}
            maxDistance={5}
            pupilColor="#2D2D2D"
            forceLookX={passwordLength > 0 && showPassword ? -5 : undefined}
            forceLookY={passwordLength > 0 && showPassword ? -4 : undefined}
            mouseX={mousePos.x}
            mouseY={mousePos.y}
          />
          <Pupil
            size={12}
            maxDistance={5}
            pupilColor="#2D2D2D"
            forceLookX={passwordLength > 0 && showPassword ? -5 : undefined}
            forceLookY={passwordLength > 0 && showPassword ? -4 : undefined}
            mouseX={mousePos.x}
            mouseY={mousePos.y}
          />
        </div>
      </div>

      {/* 4. Yellow tall rounded character - Front right */}
      <div
        ref={yellowRef}
        data-testid="char-yellow"
        onDoubleClick={(e) => handleCharDoubleClick(3, e)}
        title="双击切换【翡翠极客矩阵】全屏背景"
        className="absolute bottom-0 transition-all duration-700 ease-in-out pointer-events-auto cursor-pointer hover:brightness-110"
        style={{
          left: '295px',
          width: '135px',
          height: '220px',
          backgroundColor: '#E8D754',
          borderRadius: '68px 68px 0 0',
          zIndex: 4,
          transform:
            (passwordLength > 0 && showPassword
              ? 'skewX(0deg)'
              : `skewX(${yellowPos.bodySkew || 0}deg)`) +
            (bouncingIndex === 3 ? ' scale(1.08)' : ''),
          transformOrigin: 'bottom center',
          boxShadow: '0 8px 25px rgba(232, 215, 84, 0.3)',
        }}
      >
        {/* Eyes - pupils */}
        <div
          className="absolute flex gap-6 transition-all duration-200 ease-out"
          style={{
            left:
              passwordLength > 0 && showPassword
                ? '20px'
                : `${50 + (yellowPos.faceX || 0)}px`,
            top:
              passwordLength > 0 && showPassword
                ? '35px'
                : `${40 + (yellowPos.faceY || 0)}px`,
          }}
        >
          <Pupil
            size={12}
            maxDistance={5}
            pupilColor="#2D2D2D"
            forceLookX={passwordLength > 0 && showPassword ? -5 : undefined}
            forceLookY={passwordLength > 0 && showPassword ? -4 : undefined}
            mouseX={mousePos.x}
            mouseY={mousePos.y}
          />
          <Pupil
            size={12}
            maxDistance={5}
            pupilColor="#2D2D2D"
            forceLookX={passwordLength > 0 && showPassword ? -5 : undefined}
            forceLookY={passwordLength > 0 && showPassword ? -4 : undefined}
            mouseX={mousePos.x}
            mouseY={mousePos.y}
          />
        </div>

        {/* Cute horizontal mouth */}
        <div
          className="absolute w-16 h-[3.5px] bg-[#2D2D2D] rounded-full transition-all duration-200 ease-out"
          style={{
            left:
              passwordLength > 0 && showPassword
                ? '12px'
                : `${42 + (yellowPos.faceX || 0)}px`,
            top:
              passwordLength > 0 && showPassword
                ? '84px'
                : `${84 + (yellowPos.faceY || 0)}px`,
          }}
        />
      </div>
    </div>
  );
};

export default AnimatedCharacters;
