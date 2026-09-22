import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

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
