import {
  MaterialSymbolsRounded_400Regular,
  MaterialSymbolsRounded_400Regular_Filled,
  MaterialSymbolsRounded_500Medium,
  MaterialSymbolsRounded_500Medium_Filled,
  MaterialSymbolsRounded_600SemiBold,
  MaterialSymbolsRounded_600SemiBold_Filled,
  MaterialSymbolsRounded_700Bold,
  MaterialSymbolsRounded_700Bold_Filled,
} from '@expo-google-fonts/material-symbols-rounded'
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter'
import {
  NotoSansBengali_400Regular,
  NotoSansBengali_500Medium,
  NotoSansBengali_600SemiBold,
  NotoSansBengali_700Bold,
} from '@expo-google-fonts/noto-sans-bengali'

/**
 * Every font face the app registers. Names must match the `fontFamily` values
 * used in `shared/theme/tokens.ts` and `shared/ui/Icon.tsx`.
 */
export const appFonts = {
  Inter: Inter_400Regular,
  'Inter-Medium': Inter_500Medium,
  'Inter-SemiBold': Inter_600SemiBold,
  'Inter-Bold': Inter_700Bold,
  'Inter-ExtraBold': Inter_800ExtraBold,

  NotoSansBengali: NotoSansBengali_400Regular,
  'NotoSansBengali-Medium': NotoSansBengali_500Medium,
  'NotoSansBengali-SemiBold': NotoSansBengali_600SemiBold,
  'NotoSansBengali-Bold': NotoSansBengali_700Bold,

  MaterialSymbolsRounded400Regular: MaterialSymbolsRounded_400Regular,
  MaterialSymbolsRounded400RegularFilled: MaterialSymbolsRounded_400Regular_Filled,
  MaterialSymbolsRounded500Medium: MaterialSymbolsRounded_500Medium,
  MaterialSymbolsRounded500MediumFilled: MaterialSymbolsRounded_500Medium_Filled,
  MaterialSymbolsRounded600SemiBold: MaterialSymbolsRounded_600SemiBold,
  MaterialSymbolsRounded600SemiBoldFilled: MaterialSymbolsRounded_600SemiBold_Filled,
  MaterialSymbolsRounded700Bold: MaterialSymbolsRounded_700Bold,
  MaterialSymbolsRounded700BoldFilled: MaterialSymbolsRounded_700Bold_Filled,
}
