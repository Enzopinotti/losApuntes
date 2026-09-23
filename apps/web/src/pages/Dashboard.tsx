import { Link } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";

const Dashboard = () => {
  const { user } = useAuth();

  return (
    <section>
      <h1>Tu espacio en Los Apuntes</h1>
      <p>
        Sesión activa para <strong>{user?.email}</strong>.
      </p>
      <p>
        El onboarding académico va a completar universidad, carrera y materias
        sin mezclarlas con tu cuenta de acceso.
      </p>
      <p>
        <Link to="/profile">Completar o editar mi perfil</Link>
      </p>
      <p>
        <Link to="/resources">Buscar o subir apuntes</Link>
      </p>
      <p>
        <Link to="/questions">Preguntar o responder dudas académicas</Link>
      </p>
      <p>
        <Link to="/network">Revisar mi red</Link>
      </p>
      <p>
        <Link to="/notifications">Ver notificaciones</Link>
      </p>
      <Link to="/settings/security">Revisar seguridad de la cuenta</Link>
    </section>
  );
};

export default Dashboard;
