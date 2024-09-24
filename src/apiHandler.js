import axios from 'axios';

export const exportTableData = async (dbConfig, table, token) => {
  try {
    const response = await axios.post('https://api.rsvapp.com/v3/utils/softrestsync/', {
      table,
      config: dbConfig
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
      }
    });

    return response.status === 200;
  } catch (error) {
    console.error('Error al exportar la tabla:', error);
    return false;
  }
};