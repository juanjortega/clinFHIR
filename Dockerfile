
# Usar una imagen base con Python para crear el servidor HTTP
FROM python:2.7

# Instalar git para clonar el repositorio
RUN apt-get update && apt-get install -y git

# Directorio de trabajo en el contenedor
WORKDIR /app

# Clonar el repositorio desde GitHub
#RUN git clone https://github.com/myungchoi/clinFHIR.git
RUN git clone https://github.com/davidhay25/clinFHIR.git


# Cambiar al directorio del repositorio
WORKDIR /app/clinFHIR

# Cambiar los permisos para que el script sea ejecutable
RUN chmod +x /app/clinFHIR/startServer.sh


# Exponer el puerto 8000 para el servidor HTTP
EXPOSE 8000

# Comando para iniciar el servidor HTTP utilizando el script
CMD ["/app/clinFHIR/startServer.sh"]
