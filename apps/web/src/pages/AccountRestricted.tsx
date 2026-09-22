import { Link } from "react-router-dom";

const AccountRestricted = () => {
  return (
    <section className="auth-page" aria-labelledby="account-restricted-title">
      <h1 id="account-restricted-title">Acceso restringido</h1>
      <p>
        La cuenta está registrada, pero en este momento no puede usar las
        funciones autenticadas de Los Apuntes.
      </p>
      <p>
        Si pensás que se trata de un error, conservá cualquier referencia de
        soporte que hayas visto y contactá al canal de ayuda cuando esté
        disponible.
      </p>
      <Link to="/login">Volver a iniciar sesión</Link>
    </section>
  );
};

export default AccountRestricted;
