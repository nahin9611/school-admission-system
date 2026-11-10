FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY ["SchoolAdmission.sln", "./"]
COPY ["src/SchoolAdmission.Api/SchoolAdmission.Api.csproj", "src/SchoolAdmission.Api/"]
COPY ["tests/SchoolAdmission.Tests/SchoolAdmission.Tests.csproj", "tests/SchoolAdmission.Tests/"]
RUN dotnet restore "src/SchoolAdmission.Api/SchoolAdmission.Api.csproj"

COPY . .
WORKDIR "/src/src/SchoolAdmission.Api"
RUN dotnet publish "SchoolAdmission.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "SchoolAdmission.Api.dll"]
