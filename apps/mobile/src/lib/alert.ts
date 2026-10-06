import { type AlertButton, Alert as NativeAlert, Platform } from 'react-native';

// Alert.alert ne fait rien sur le web. Pour l'aperçu dans le navigateur, on passe par la boîte de
// confirmation du navigateur : « OK » déclenche le bouton d'action, « Annuler » le bouton d'annulation.
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (Platform.OS !== 'web') return NativeAlert.alert(title, message, buttons);
    const confirmed = window.confirm([title, message].filter(Boolean).join('\n\n'));
    const cancel = buttons?.find((button) => button.style === 'cancel');
    const action = buttons?.find((button) => button.style !== 'cancel');
    (confirmed ? action : cancel)?.onPress?.();
  },
};
