import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useThemeColors } from '../context/ThemeContext';
import { useTranslation } from '../i18n/useTranslation';

// A plain text glyph ("‹") sits at an inconsistent vertical position depending on the
// platform's font metrics, which looked misplaced next to the header title. A proper
// icon glyph is designed to be optically centered and renders consistently everywhere.
export default function BackButton() {
  const navigation = useNavigation();
  const colors = useThemeColors();
  const t = useTranslation();
  if (!navigation.canGoBack()) return null;

  return (
    <Pressable
      onPress={() => navigation.goBack()}
      hitSlop={12}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={t('common.goBack')}
    >
      <Ionicons name="chevron-back" size={26} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
});
