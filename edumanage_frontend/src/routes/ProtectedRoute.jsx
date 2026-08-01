import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore.js';

export const ProtectedRoute = ({ allowedRoles, delegationScope }) => {
  const { isLoggedIn, user, delegatedAccess } = useAuthStore();

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  const role = user?.role?.toLowerCase();
  const roleAllowed = !allowedRoles || allowedRoles.includes(role);
  // A deputy faculty may reach a route if they hold the matching delegated scope.
  const delegationAllowed = delegationScope && (delegatedAccess || []).includes(delegationScope);

  if (!roleAllowed && !delegationAllowed) {
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
