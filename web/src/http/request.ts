import axios from "axios";

axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || "";
axios.defaults.withCredentials = true;

function currentRoutePath() {
  return window.location.hash.startsWith("#/")
    ? window.location.hash.slice(1).split("?")[0]
    : window.location.pathname;
}

function loginUrl() {
  return window.location.hash.startsWith("#/")
    ? `${window.location.pathname}${window.location.search}#/login`
    : "/login";
}

axios.interceptors.response.use((res) => {
  return res.data;
}, (error) => {
  if (error.response?.status === 401 && currentRoutePath() !== "/login") {
    window.location.assign(loginUrl());
  }

  return Promise.reject(error);
});
export const request = axios;
