import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const GOKU = require('@/assets/images/splash-goku.png');

/** How long Goku floats before the overlay fades away. */
const HOLD_MS = 2200;

/**
 * Full-screen splash overlay. Shows the Goku image gently bobbing up and down,
 * then fades out and calls `onFinish`. Sits on top of the app while it mounts.
 */
export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const float = useSharedValue(0);
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(1);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  // Run exactly once — a fresh `onFinish` identity must not restart the timer.
  useEffect(() => {
    const finish = () => onFinishRef.current();

    // Hand off from the native splash to this animated one.
    SplashScreen.hideAsync().catch(() => {});

    scale.value = withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) });

    float.value = withRepeat(
      withSequence(
        withTiming(-16, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );

    opacity.value = withDelay(
      HOLD_MS,
      withTiming(0, { duration: 450 }, (finished) => {
        if (finished) runOnJS(finish)();
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const gokuStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.container, overlayStyle]}
      pointerEvents="none">
      <Animated.View style={gokuStyle}>
        <Image source={GOKU} style={styles.image} contentFit="contain" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: 280, height: 280 },
});
