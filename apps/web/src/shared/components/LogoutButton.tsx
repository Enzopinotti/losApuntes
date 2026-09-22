import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/useAuth";

const LogoutButton = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return <button onClick={handleLogout}>Cerrar sesión</button>;
};

export default LogoutButton;
