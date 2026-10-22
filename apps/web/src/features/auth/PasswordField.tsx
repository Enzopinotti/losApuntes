import { forwardRef, useEffect, useState, type InputHTMLAttributes } from "react";
import "./PasswordField.scss";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  id: string;
  label: string;
};

/**
 * Preserves the same native input node and ref for React Hook Form/autofill.
 * No password content is read by this component and no value is persisted.
 */
const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField(
  { id, label, disabled, ...inputProps },
  ref,
) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const conceal = () => setRevealed(false);
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") conceal();
    };

    window.addEventListener("blur", conceal);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", conceal);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const visible = revealed && !disabled;

  return (
    <div className="auth-password-field">
      <input
        {...inputProps}
        id={id}
        ref={ref}
        type={visible ? "text" : "password"}
        disabled={disabled}
      />
      <button
        type="button"
        className="auth-password-field-toggle"
        aria-controls={id}
        aria-pressed={visible}
        aria-label={`${visible ? "Ocultar" : "Mostrar"} ${label.toLowerCase()}`}
        disabled={disabled}
        onClick={() => setRevealed((current) => !current)}
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
});

export default PasswordField;
