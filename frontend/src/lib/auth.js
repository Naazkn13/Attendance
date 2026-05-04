// Auth utility functions for both portals

export const login = async (username, password) => {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Login failed');
    }

    const data = await response.json();
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    return data;
  } catch (error) {
    throw error;
  }
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login'; // Redirect to main login
};

export const employeeLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/employee/login';
};

export const getToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token');
  }
  return null;
};

export const getUser = () => {
  if (typeof window !== 'undefined') {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        return JSON.parse(user);
      } catch (e) {
        return null;
      }
    }
  }
  return null;
};

export const isAuthenticated = () => {
  return !!getToken();
};

export const hasRole = (roles) => {
  const user = getUser();
  if (!user) return false;
  return roles.includes(user.role);
};
