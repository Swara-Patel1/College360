import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore.js';

export const ProtectedRoute = ({ allowedRoles }) => {
  const { isLoggedIn, user } = useAuthStore();

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role?.toLowerCase())) {
    // Redirect unauthorized user to their respective dashboard
    const roleDestinations = {
      admin: '/dashboard/admin',
      faculty: '/dashboard/faculty',
      hod: '/dashboard/faculty', // HOD and Faculty share the faculty dashboard base
      student: '/dashboard/student',
    };
    const defaultDest = roleDestinations[user?.role?.toLowerCase()] || '/login';
    return <Navigate to={defaultDest} replace />;
  }

  return <Outlet />;
};
