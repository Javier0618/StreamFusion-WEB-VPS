import { API_BASE_URL } from './config.js';

async function request(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error en la petición a la API');
    }

    return response.json();
}

// Auth
export const login = (email, password) => request('auth.php?action=login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
});

export const register = (name, email, password) => request('auth.php?action=register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
});

export const getAuthStatus = () => request('auth.php?action=status');

// Content
export const getAllContent = () => request('content.php?action=get_all');
export const getContentById = (id) => request(`content.php?action=get_by_id&id=${id}`);
export const importContent = (content) => request('content.php?action=import', {
    method: 'POST',
    body: JSON.stringify(content),
});
export const deleteContent = (id) => request(`content.php?action=delete&id=${id}`, {
    method: 'DELETE',
});
export const updateContentUrls = (data) => request('content.php?action=update_urls', {
    method: 'POST',
    body: JSON.stringify(data),
});

// Users
export const getAllUsers = () => request('users.php?action=get_all');
export const updateUser = (userData) => request('users.php?action=update', {
    method: 'POST',
    body: JSON.stringify(userData),
});
export const deleteUser = (id) => request(`users.php?action=delete&id=${id}`, {
    method: 'DELETE',
});
export const getMyList = () => request('users.php?action=get_my_list');
export const addToMyList = (item) => request('users.php?action=add_to_my_list', {
    method: 'POST',
    body: JSON.stringify(item),
});
export const removeFromMyList = (id) => request('users.php?action=remove_from_my_list', {
    method: 'POST',
    body: JSON.stringify({ id }),
});

// Messages
export const getMyMessages = () => request('messages.php?action=get_my_messages');
export const sendToAdmin = (content) => request('messages.php?action=send_to_admin', {
    method: 'POST',
    body: JSON.stringify({ content }),
});
export const adminGetMessages = () => request('messages.php?action=admin_get_messages');
export const adminSendMessage = (to_user_id, content) => request('messages.php?action=admin_send_message', {
    method: 'POST',
    body: JSON.stringify({ to_user_id, content }),
});
export const deleteMessage = (id) => request(`messages.php?action=delete&id=${id}`, {
    method: 'DELETE',
});

// Settings
export const getSettings = () => request('settings.php?action=get');
export const updateSettings = (settings) => request('settings.php?action=update', {
    method: 'POST',
    body: JSON.stringify(settings),
});

// Stats
export const recordClick = (data) => request('stats.php?action=record_click', {
    method: 'POST',
    body: JSON.stringify(data),
});
export const getTopClicks = (limit) => request(`stats.php?action=get_top_clicks&limit=${limit}`);
