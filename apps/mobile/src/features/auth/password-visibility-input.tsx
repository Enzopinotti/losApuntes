import { useEffect, useReducer } from "react";
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { passwordVisibilityReducer } from "./password-visibility";

type PasswordVisibilityInputProps = Omit<
  TextInputProps,
  "accessibilityLabel" | "secureTextEntry"
> & {
  fieldLabel: string;
};

export function PasswordVisibilityInput({
  fieldLabel,
  editable = true,
  value,
  ...inputProps
}: PasswordVisibilityInputProps) {
  const [visible, dispatchVisibility] = useReducer(
    passwordVisibilityReducer,
    false,
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") dispatchVisibility("mask");
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!value) dispatchVisibility("mask");
  }, [value]);

  return (
    <View style={styles.field}>
      <TextInput
        {...inputProps}
        accessibilityLabel={fieldLabel}
        editable={editable}
        secureTextEntry={!visible}
        value={value}
      />
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={`Visibilidad de ${fieldLabel}`}
        accessibilityHint="Activa para mostrar u ocultar el texto de este campo."
        accessibilityState={{ checked: visible, disabled: !editable }}
        disabled={!editable}
        onPress={() => dispatchVisibility("toggle")}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>{visible ? "Ocultar" : "Mostrar"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 2 },
  toggle: {
    minHeight: 44,
    minWidth: 44,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  toggleText: { color: "#34345a", fontWeight: "700" },
});
