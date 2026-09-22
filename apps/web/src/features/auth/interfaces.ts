export type LoginFormData = {
  email: string;
  password: string;
};

export type SignUpFormData = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type User = {
  name: string;
  email: string;
};
