import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTheme } from './theme';

type BubbleSpec = {
  top: `${number}%`;
  left?: `${number}%`;
  right?: `${number}%`;
  size: number;
  dx: number;
  dy: number;
  scale: number;
  duration: number;
  delay: number;
  tint: 'surface' | 'surfaceStrong' | 'accent' | 'accentMuted';
  opacity: number;
};

const BUBBLES = [
  { top: '1%', left: '-10%', size: 240, dx: 22, dy: 28, scale: 1.1, duration: 16000, delay: 0, tint: 'surface' as const, opacity: 0.3 },
  { top: '7%', right: '-12%', size: 400, dx: -28, dy: 22, scale: 1.08, duration: 22000, delay: 1200, tint: 'accent' as const, opacity: 0.2 },
  { top: '24%', left: '66%', size: 140, dx: -14, dy: 18, scale: 1.15, duration: 14000, delay: 2200, tint: 'accentMuted' as const, opacity: 0.22 },
  { top: '36%', left: '-8%', size: 220, dx: 18, dy: -20, scale: 1.08, duration: 18000, delay: 600, tint: 'surfaceStrong' as const, opacity: 0.18 },
  { top: '50%', right: '-5%', size: 170, dx: -20, dy: 18, scale: 1.12, duration: 17000, delay: 1800, tint: 'accent' as const, opacity: 0.14 },
  { top: '62%', left: '10%', size: 104, dx: 14, dy: -14, scale: 1.16, duration: 13000, delay: 900, tint: 'accentMuted' as const, opacity: 0.24 },
  { top: '74%', left: '54%', size: 260, dx: -22, dy: 24, scale: 1.1, duration: 21000, delay: 1500, tint: 'surfaceStrong' as const, opacity: 0.2 },
  { top: '86%', right: '-10%', size: 220, dx: -16, dy: -24, scale: 1.1, duration: 19000, delay: 2600, tint: 'accent' as const, opacity: 0.16 },
  { top: '18%', left: '18%', size: 76, dx: 10, dy: -10, scale: 1.18, duration: 12000, delay: 400, tint: 'accent' as const, opacity: 0.22 },
  { top: '82%', left: '22%', size: 64, dx: 8, dy: 10, scale: 1.2, duration: 11000, delay: 1400, tint: 'accentMuted' as const, opacity: 0.24 },
] satisfies BubbleSpec[];

function alphaHex(value: string, opacity: number) {
  const normalized = Math.max(0, Math.min(1, opacity));
  const alpha = Math.round(normalized * 255)
    .toString(16)
    .padStart(2, '0');

  return `${value}${alpha}`;
}

export function AmbientBackground() {
  const { colors, isDark } = useTheme();
  const progressValues = useRef(BUBBLES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = progressValues.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(BUBBLES[index].delay),
          Animated.timing(value, {
            toValue: 1,
            duration: BUBBLES[index].duration,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: BUBBLES[index].duration,
            useNativeDriver: true,
          }),
        ])
      )
    );

    animations.forEach((animation) => animation.start());

    return () => {
      animations.forEach((animation) => animation.stop());
    };
  }, [progressValues]);

  return (
    <View pointerEvents="none" style={styles.container}>
      {BUBBLES.map((bubble, index) => {
        const progress = progressValues[index];
        const translateX = progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, bubble.dx, 0],
        });
        const translateY = progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, bubble.dy, 0],
        });
        const scale = progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [1, bubble.scale, 1],
        });
        const opacity = progress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [bubble.opacity * 0.75, bubble.opacity, bubble.opacity * 0.8],
        });
        const tintColor = colors[bubble.tint];
        const bubbleColor = alphaHex(
          tintColor,
          isDark ? bubble.opacity : Math.min(bubble.opacity * 0.8, 0.14)
        );

        return (
          <Animated.View
            key={`${bubble.top}-${bubble.size}-${index}`}
            style={[
              styles.bubble,
              {
                backgroundColor: bubbleColor,
                borderColor: alphaHex(colors.text, isDark ? 0.08 : 0.06),
                borderWidth: 1,
                height: bubble.size,
                width: bubble.size,
                borderRadius: bubble.size / 2,
                opacity,
                transform: [{ translateX }, { translateY }, { scale }],
              },
              bubble.left ? { left: bubble.left } : null,
              bubble.right ? { right: bubble.right } : null,
              { top: bubble.top },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  bubble: {
    position: 'absolute',
  },
});
